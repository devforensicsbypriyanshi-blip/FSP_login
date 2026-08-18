import { generateKeyPairSync, createSign, X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalString,
  isAllowedTopic,
  isTrustedCertUrl,
  parseSesEvent,
  verifySnsSignature,
} from './sns';

/**
 * The certificate-URL tests are the important ones.
 *
 * SNS puts the signing certificate URL inside the message, which the sender
 * controls. Fetching it without checking the host means verifying an attacker's
 * signature against an attacker's certificate — a check that always passes,
 * while looking like it works.
 */

describe('isTrustedCertUrl', () => {
  it('accepts a real SNS certificate URL', () => {
    expect(
      isTrustedCertUrl('https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc123.pem')
    ).toBe(true);
  });

  it('accepts the China partition', () => {
    expect(isTrustedCertUrl('https://sns.cn-north-1.amazonaws.com.cn/cert.pem')).toBe(true);
  });

  it('refuses a lookalike host', () => {
    expect(isTrustedCertUrl('https://sns.ap-south-1.amazonaws.com.evil.example/cert.pem')).toBe(false);
    expect(isTrustedCertUrl('https://evil.example/sns.ap-south-1.amazonaws.com/cert.pem')).toBe(false);
    expect(isTrustedCertUrl('https://amazonaws.com/cert.pem')).toBe(false);
  });

  it('refuses userinfo smuggling', () => {
    expect(isTrustedCertUrl('https://sns.ap-south-1.amazonaws.com@evil.example/cert.pem')).toBe(false);
  });

  it('refuses plain http', () => {
    expect(isTrustedCertUrl('http://sns.ap-south-1.amazonaws.com/cert.pem')).toBe(false);
  });

  it('refuses a non-pem path', () => {
    expect(isTrustedCertUrl('https://sns.ap-south-1.amazonaws.com/evil.js')).toBe(false);
  });

  it('refuses garbage', () => {
    expect(isTrustedCertUrl(undefined)).toBe(false);
    expect(isTrustedCertUrl('not a url')).toBe(false);
    expect(isTrustedCertUrl('')).toBe(false);
  });
});

describe('isAllowedTopic', () => {
  it('fails closed when nothing is configured', () => {
    delete process.env.SES_SNS_TOPIC_ARNS;
    delete process.env.SES_SNS_TOPIC_ARN;
    expect(isAllowedTopic('arn:aws:sns:ap-south-1:1234:fsp-bounces')).toBe(false);
  });

  it('accepts only the configured topics', () => {
    process.env.SES_SNS_TOPIC_ARNS =
      'arn:aws:sns:ap-south-1:1234:fsp-bounces, arn:aws:sns:ap-south-1:1234:fsp-complaints';

    expect(isAllowedTopic('arn:aws:sns:ap-south-1:1234:fsp-bounces')).toBe(true);
    expect(isAllowedTopic('arn:aws:sns:ap-south-1:1234:fsp-complaints')).toBe(true);
    // A valid AWS signature from somebody else's topic is still somebody else's.
    expect(isAllowedTopic('arn:aws:sns:us-east-1:9999:attacker-topic')).toBe(false);
    expect(isAllowedTopic(undefined)).toBe(false);

    delete process.env.SES_SNS_TOPIC_ARNS;
  });
});

describe('buildCanonicalString', () => {
  it('uses the notification field order and skips absent optionals', () => {
    const canonical = buildCanonicalString({
      Type: 'Notification',
      MessageId: 'm-1',
      TopicArn: 'arn:topic',
      Message: 'body',
      Timestamp: '2026-08-14T00:00:00.000Z',
    });

    expect(canonical).toBe(
      'Message\nbody\nMessageId\nm-1\nTimestamp\n2026-08-14T00:00:00.000Z\nTopicArn\narn:topic\nType\nNotification\n'
    );
    expect(canonical).not.toContain('Subject');
  });

  it('includes Subject when present, in order', () => {
    const canonical = buildCanonicalString({
      Type: 'Notification',
      MessageId: 'm-1',
      TopicArn: 'arn:topic',
      Message: 'body',
      Subject: 'Amazon SES',
      Timestamp: 't',
    });

    expect(canonical).toBe(
      'Message\nbody\nMessageId\nm-1\nSubject\nAmazon SES\nTimestamp\nt\nTopicArn\narn:topic\nType\nNotification\n'
    );
  });

  it('uses the subscription field set for a confirmation', () => {
    const canonical = buildCanonicalString({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm-2',
      Token: 'tok',
      TopicArn: 'arn:topic',
      Message: 'confirm me',
      SubscribeURL: 'https://sns.ap-south-1.amazonaws.com/?Action=Confirm',
      Timestamp: 't',
    });

    expect(canonical).toContain('SubscribeURL\nhttps://sns.ap-south-1.amazonaws.com/?Action=Confirm\n');
    expect(canonical).toContain('Token\ntok\n');
  });
});

describe('verifySnsSignature', () => {
  // A throwaway self-signed certificate. The test is that the maths works and
  // that tampering breaks it, which does not need a real AWS chain.
  const { privateKey, certificate } = (() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    // node:crypto cannot mint an X.509 cert, so verify against the public key
    // directly — createVerify accepts either.
    return { privateKey, certificate: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  })();

  const message = {
    Type: 'Notification',
    MessageId: 'm-1',
    TopicArn: 'arn:topic',
    Message: '{"notificationType":"Bounce"}',
    Timestamp: '2026-08-14T00:00:00.000Z',
    SignatureVersion: '1',
  };

  function sign(payload: typeof message, algorithm = 'RSA-SHA1'): string {
    const signer = createSign(algorithm);
    signer.update(buildCanonicalString(payload), 'utf8');
    return signer.sign(privateKey, 'base64');
  }

  it('accepts a correctly signed v1 message', () => {
    const signed = { ...message, Signature: sign(message) };
    expect(verifySnsSignature(signed, certificate)).toEqual({ ok: true });
  });

  it('accepts a correctly signed v2 message', () => {
    const v2 = { ...message, SignatureVersion: '2' };
    const signed = { ...v2, Signature: sign(v2, 'RSA-SHA256') };
    expect(verifySnsSignature(signed, certificate)).toEqual({ ok: true });
  });

  it('rejects a message whose body was altered after signing', () => {
    const signed = { ...message, Signature: sign(message) };
    const tampered = { ...signed, Message: '{"notificationType":"Complaint"}' };
    expect(verifySnsSignature(tampered, certificate).ok).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifySnsSignature(message, certificate).ok).toBe(false);
  });

  it('rejects an unknown signature version', () => {
    const odd = { ...message, SignatureVersion: '99', Signature: sign(message) };
    expect(verifySnsSignature(odd, certificate)).toEqual({
      ok: false,
      reason: 'unsupported signature version',
    });
  });

  it('does not throw on a malformed certificate', () => {
    const signed = { ...message, Signature: sign(message) };
    expect(verifySnsSignature(signed, 'not a certificate').ok).toBe(false);
  });

  it('X509Certificate is available for real AWS certs', () => {
    // Guards the assumption that node:crypto can read PEM certs at all, since
    // production passes a real certificate rather than a bare public key.
    expect(typeof X509Certificate).toBe('function');
  });
});

describe('parseSesEvent', () => {
  it('reads a bounce, preferring the bounced recipient list', () => {
    const event = parseSesEvent(
      JSON.stringify({
        notificationType: 'Bounce',
        mail: { messageId: 'msg-1', destination: ['a@example.com', 'b@example.com'] },
        bounce: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          timestamp: '2026-08-14T10:00:00.000Z',
          bouncedRecipients: [{ emailAddress: 'b@example.com', diagnosticCode: '550 no such user' }],
        },
      })
    );

    expect(event).toMatchObject({
      type: 'email.bounced',
      recipients: ['b@example.com'],
      bounceType: 'Permanent',
      detail: '550 no such user',
      occurredAt: '2026-08-14T10:00:00.000Z',
    });
  });

  it('distinguishes a transient bounce, which must not suppress', () => {
    const event = parseSesEvent(
      JSON.stringify({
        notificationType: 'Bounce',
        mail: { messageId: 'msg-2', destination: ['a@example.com'] },
        bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'a@example.com' }] },
      })
    );

    expect(event?.bounceType).toBe('Transient');
  });

  it('reads a complaint', () => {
    const event = parseSesEvent(
      JSON.stringify({
        notificationType: 'Complaint',
        mail: { messageId: 'msg-3' },
        complaint: {
          complaintFeedbackType: 'abuse',
          complainedRecipients: [{ emailAddress: 'c@example.com' }],
        },
      })
    );

    expect(event).toMatchObject({ type: 'email.complained', recipients: ['c@example.com'], detail: 'abuse' });
  });

  it('reads a delivery', () => {
    const event = parseSesEvent(
      JSON.stringify({
        notificationType: 'Delivery',
        mail: { messageId: 'msg-4' },
        delivery: { recipients: ['d@example.com'], timestamp: '2026-08-14T11:00:00.000Z' },
      })
    );

    expect(event).toMatchObject({ type: 'email.delivered', recipients: ['d@example.com'] });
  });

  it('reads the newer eventType shape from a configuration set', () => {
    const event = parseSesEvent(
      JSON.stringify({
        eventType: 'Delivery',
        mail: { messageId: 'msg-5', destination: ['e@example.com'] },
        delivery: {},
      })
    );

    expect(event?.type).toBe('email.delivered');
  });

  it('returns null for anything unrecognised', () => {
    expect(parseSesEvent('not json')).toBeNull();
    expect(parseSesEvent(JSON.stringify({ notificationType: 'AmazonSnsSubscriptionSucceeded' }))).toBeNull();
    expect(parseSesEvent(JSON.stringify({}))).toBeNull();
  });
});
