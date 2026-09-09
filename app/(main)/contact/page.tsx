import { Mail, MapPin, Phone, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ContactForm } from '@/components/contact/ContactForm';

export const metadata = { title: 'Contact — RenovateGE' };

export default async function ContactPage() {
  const ka = await getT();
  const info = [
    { icon: MapPin, label: ka.pages.contact.addressLabel, value: ka.footer.address },
    { icon: Mail, label: ka.pages.contact.emailInfoLabel, value: ka.footer.email },
    { icon: Phone, label: ka.pages.contact.phoneLabel, value: ka.footer.phone },
    {
      icon: Clock,
      label: ka.pages.contact.hoursLabel,
      value: ka.pages.contact.hoursValue,
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-bg-base via-brand/5 to-accent/10" />
        <div className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
              {ka.pages.contact.title}
            </h1>
            <p className="mt-3 text-lg text-ink-muted">
              {ka.pages.contact.subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Form + Info */}
      <section className="container pb-20">
        <div className="grid gap-8 md:grid-cols-5">
          <div className="md:col-span-3">
            <Card>
              <CardContent className="p-6 md:p-8">
                <h2 className="mb-6 font-serif text-2xl font-semibold">
                  {ka.pages.contact.formTitle}
                </h2>
                <ContactForm />
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card>
              <CardContent className="p-6 md:p-8">
                <h2 className="mb-6 font-serif text-2xl font-semibold">
                  {ka.pages.contact.infoTitle}
                </h2>
                <ul className="space-y-5">
                  {info.map((i) => (
                    <li key={i.label} className="flex items-start gap-3">
                      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                        <i.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-ink-muted">
                          {i.label}
                        </p>
                        <p className="mt-0.5 break-words text-sm font-medium">
                          {i.value}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
