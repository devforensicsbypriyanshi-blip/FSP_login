'use client';

import { Check, CircleCheck, Plus, Send, Trash2, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { deleteQuestion, saveQuestion, setQuizStatus } from '@/lib/actions/authoring';
import type { EditorQuestion } from '@/lib/data/studio';

/**
 * Question editor for one quiz.
 *
 * Every save is a whole question — body, marks and all its options in one call.
 * upsert_question() replaces the option set rather than diffing it, because a
 * half-applied edit on an exam question is worse than a redundant write: a
 * question briefly holding two correct answers, or none, scores wrongly for any
 * student who submits in that window.
 *
 * The "exactly one correct" rule is enforced in the database. It is mirrored in
 * the button state here for the sake of the person typing, not as the control.
 */

interface DraftOption {
  body: string;
  isCorrect: boolean;
}

interface Draft {
  questionId: string | null;
  body: string;
  explanation: string;
  marks: number;
  negative: number;
  options: DraftOption[];
}

function emptyDraft(negative: number): Draft {
  return {
    questionId: null,
    body: '',
    explanation: '',
    marks: 1,
    negative,
    options: [
      { body: '', isCorrect: true },
      { body: '', isCorrect: false },
      { body: '', isCorrect: false },
      { body: '', isCorrect: false },
    ],
  };
}

function toDraft(question: EditorQuestion): Draft {
  return {
    questionId: question.id,
    body: question.body,
    explanation: question.explanation ?? '',
    marks: question.marks,
    negative: question.negative,
    options: question.options.map((option) => ({ body: option.body, isCorrect: option.isCorrect })),
  };
}

export function QuizBuilder({
  quizId,
  questions,
  defaultNegative,
  readOnly,
}: {
  quizId: string;
  questions: EditorQuestion[];
  defaultNegative: number;
  readOnly: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const filled = draft?.options.filter((option) => option.body.trim().length > 0) ?? [];
  const correctCount = filled.filter((option) => option.isCorrect).length;
  const canSave = Boolean(draft && draft.body.trim().length >= 3 && filled.length >= 2 && correctCount === 1);

  function save() {
    if (!draft) return;
    startTransition(async () => {
      const result = await saveQuestion({
        quizId,
        questionId: draft.questionId,
        body: draft.body,
        explanation: draft.explanation,
        marks: draft.marks,
        negative: draft.negative,
        options: draft.options.map((option) => ({ body: option.body, is_correct: option.isCorrect })),
      });
      setFeedback(result);
      if (result.ok) setDraft(null);
    });
  }

  function remove(questionId: string) {
    startTransition(async () => {
      setFeedback(await deleteQuestion(questionId));
    });
  }

  function patch(changes: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  function patchOption(index: number, changes: Partial<DraftOption>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            options: current.options.map((option, i) => (i === index ? { ...option, ...changes } : option)),
          }
        : current
    );
  }

  /** Radio semantics: choosing a correct answer un-chooses the previous one. */
  function chooseCorrect(index: number) {
    setDraft((current) =>
      current
        ? { ...current, options: current.options.map((option, i) => ({ ...option, isCorrect: i === index })) }
        : current
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          className={
            feedback.ok
              ? 'border-success-border bg-success-bg text-success rounded-xl border p-3 text-[13px]'
              : 'border-error-border bg-error-bg text-error rounded-xl border p-3 text-[13px]'
          }
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.message}
        </p>
      )}

      {questions.length === 0 && !draft && (
        <p className="text-ink-muted text-[13px] leading-relaxed">
          No questions yet. A test cannot be published until it has at least one, and every question needs two
          options with exactly one marked correct.
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {questions.map((question, index) => (
          <li key={question.id} className="border-line-medium bg-surface rounded-2xl border p-4">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <p className="text-ink font-semibold">
                Q{index + 1}. {question.body}
              </p>
              <Badge variant="purple">
                +{question.marks}
                {question.negative > 0 ? ` / −${question.negative}` : ''}
              </Badge>
            </div>

            <ul className="flex flex-col gap-1.5">
              {question.options.map((option) => (
                <li key={option.id} className="flex items-center gap-2 text-[13.5px]">
                  {option.isCorrect ? (
                    <CircleCheck className="text-success size-4 shrink-0" aria-hidden />
                  ) : (
                    <span className="border-line-medium size-4 shrink-0 rounded-full border" aria-hidden />
                  )}
                  <span className={option.isCorrect ? 'text-ink font-medium' : 'text-ink-secondary'}>
                    {option.body}
                  </span>
                  {option.isCorrect && <span className="sr-only">Correct answer</span>}
                </li>
              ))}
            </ul>

            {question.explanation && (
              <p className="text-ink-muted border-line mt-2 border-l-2 pl-3 text-[12.5px] leading-relaxed">
                {question.explanation}
              </p>
            )}

            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(question))}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger-outline"
                  loading={pending}
                  onClick={() => remove(question.id)}
                >
                  <Trash2 className="size-4" aria-hidden /> Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {readOnly ? (
        <p className="text-ink-muted text-[12.5px] leading-relaxed">
          This test is published. Move it back to draft to change the questions — editing a paper students are
          already sitting would change their marks under them.
        </p>
      ) : draft ? (
        <div className="border-primary bg-surface flex flex-col gap-3 rounded-2xl border-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink font-semibold">{draft.questionId ? 'Edit question' : 'New question'}</p>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} aria-label="Discard">
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <Field label="Question" htmlFor="q-body">
            <Textarea
              id="q-body"
              rows={2}
              value={draft.body}
              onChange={(event) => patch({ body: event.target.value })}
              placeholder="Which reagent is most specific for seminal fluid acid phosphatase?"
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-ink-secondary mb-1 text-[13px] font-medium">
              Options — select the correct one
            </legend>
            {draft.options.map((option, index) => (
              <div key={index} className="flex items-center gap-3">
                <input
                  type="radio"
                  name="correct"
                  checked={option.isCorrect}
                  onChange={() => chooseCorrect(index)}
                  className="size-4 shrink-0 accent-[var(--color-primary)]"
                  aria-label={`Option ${index + 1} is correct`}
                />
                <Input
                  value={option.body}
                  onChange={(event) => patchOption(index, { body: event.target.value })}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1"
                  aria-label={`Option ${index + 1}`}
                />
                {draft.options.length > 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() => patch({ options: draft.options.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            {draft.options.length < 6 && (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => patch({ options: [...draft.options, { body: '', isCorrect: false }] })}
              >
                <Plus className="size-4" aria-hidden /> Add option
              </Button>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Marks" htmlFor="q-marks">
              <Input
                id="q-marks"
                type="number"
                min={0}
                step="0.5"
                value={draft.marks}
                onChange={(event) => patch({ marks: Number(event.target.value) })}
              />
            </Field>
            <Field label="Negative marking" htmlFor="q-neg" hint="0 for none.">
              <Input
                id="q-neg"
                type="number"
                min={0}
                step="0.25"
                value={draft.negative}
                onChange={(event) => patch({ negative: Number(event.target.value) })}
              />
            </Field>
          </div>

          <Field
            label="Explanation"
            htmlFor="q-exp"
            hint="Shown in review after submitting — never during the attempt."
          >
            <Textarea
              id="q-exp"
              rows={2}
              value={draft.explanation}
              onChange={(event) => patch({ explanation: event.target.value })}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={pending} disabled={!canSave} onClick={save}>
              <Check className="size-4" aria-hidden /> Save question
            </Button>
            {!canSave && (
              <span className="text-ink-muted text-[12.5px]">
                {draft.body.trim().length < 3
                  ? 'Write the question first.'
                  : filled.length < 2
                    ? 'Fill in at least two options.'
                    : 'Select exactly one correct answer.'}
              </span>
            )}
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setDraft(emptyDraft(defaultNegative))}
        >
          <Plus className="size-4" aria-hidden /> Add question
        </Button>
      )}
    </div>
  );
}

/**
 * Publish / unpublish.
 *
 * Publishing is refused by the database if any question lacks exactly one
 * correct answer, and the refusal carries the count — so the failure message is
 * "3 questions need…", which tells the educator how much work is left. The
 * disabled state here only covers the trivial zero-question case.
 */
export function QuizStatusControl({
  quizId,
  status,
  questionCount,
}: {
  quizId: string;
  status: string;
  questionCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function change(next: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await setQuizStatus(quizId, next);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {status === 'published' ? (
        <Button size="sm" variant="outline" loading={pending} onClick={() => change('draft')}>
          Move back to draft
        </Button>
      ) : (
        <Button
          size="sm"
          loading={pending}
          disabled={questionCount === 0}
          onClick={() => change('published')}
        >
          <Send className="size-4" aria-hidden /> Publish test
        </Button>
      )}
      {error && (
        <p className="text-error max-w-xs text-right text-[12.5px] leading-relaxed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
