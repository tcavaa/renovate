'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';

export function ContactForm() {
  const ka = useT();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Stub: pretend we send the message (no backend yet).
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h3 className="font-serif text-xl font-semibold">
          {ka.pages.contact.successTitle}
        </h3>
        <p className="text-sm text-ink-muted">{ka.pages.contact.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">{ka.pages.contact.nameLabel}</Label>
          <Input
            id="contact-name"
            required
            placeholder={ka.pages.contact.namePlaceholder}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">{ka.pages.contact.emailLabel}</Label>
          <Input
            id="contact-email"
            type="email"
            required
            placeholder={ka.pages.contact.emailPlaceholder}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-subject">{ka.pages.contact.subjectLabel}</Label>
        <Input
          id="contact-subject"
          required
          placeholder={ka.pages.contact.subjectPlaceholder}
          value={form.subject}
          onChange={(e) => update('subject', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">{ka.pages.contact.messageLabel}</Label>
        <Textarea
          id="contact-message"
          required
          rows={6}
          placeholder={ka.pages.contact.messagePlaceholder}
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {ka.pages.contact.submit}
      </Button>
    </form>
  );
}
