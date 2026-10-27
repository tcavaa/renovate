import { Mail, MapPin, Phone, Clock, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ContactForm } from '@/components/contact/ContactForm';
import { LogoMark } from '@/components/layout/Logo';

export const metadata = { title: 'Contact' };

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
    // The legal entity behind the site, as the card schemes and the payment provider require.
    {
      icon: Building2,
      label: ka.footer.requisites,
      value: `${ka.footer.company_name} · ${ka.footer.companyIdLabel} ${ka.footer.company_id} · ${ka.footer.legal_address}`,
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-radial-warm">
        <div className="grain relative">
          <span className="arch pointer-events-none absolute -bottom-6 left-[6%] hidden h-40 w-24 bg-stone/70 md:block" aria-hidden />
          <span className="arch pointer-events-none absolute -bottom-6 right-[7%] hidden h-48 w-32 bg-brand/85 md:block" aria-hidden />
          <div className="container relative py-16 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <LogoMark tone="sand" className="mx-auto mb-7 h-12 w-12 shadow-card" />
              <h1 className="display text-[clamp(2.2rem,4.8vw,4rem)] text-ink">
                {ka.pages.contact.title}
              </h1>
              <p className="mx-auto mt-5 max-w-xl font-serif text-xl text-ink-soft md:text-2xl">
                {ka.pages.contact.subtitle}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Form + Info */}
      <section className="container pb-20">
        <div className="grid gap-6 md:grid-cols-5 md:gap-8">
          <div className="md:col-span-3">
            <Card className="rounded-3xl">
              <CardContent className="p-6 md:p-10">
                <h2 className="mb-7 font-serif text-3xl font-semibold">
                  {ka.pages.contact.formTitle}
                </h2>
                <ContactForm />
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card className="relative h-full overflow-hidden rounded-3xl border-0 bg-olive text-sand-light shadow-cardHover">
              {/* The brand board's six swatches as the panel's top edge, and an arch behind the list. */}
              <div className="grid h-1.5 grid-cols-6" aria-hidden>
                <span className="bg-sand" />
                <span className="bg-stone" />
                <span className="bg-wood" />
                <span className="bg-brand" />
                <span className="bg-olive-light" />
                <span className="bg-charcoal" />
              </div>
              <span className="arch pointer-events-none absolute -bottom-16 -right-10 h-56 w-40 bg-olive-light/25" aria-hidden />
              <CardContent className="relative p-6 md:p-10">
                <h2 className="mb-7 font-serif text-3xl font-semibold text-sand-light">
                  {ka.pages.contact.infoTitle}
                </h2>
                <ul className="space-y-5">
                  {info.map((i) => (
                    <li key={i.label} className="flex items-start gap-3.5">
                      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sand-light/10 text-wood-light ring-1 ring-inset ring-sand-light/15">
                        <i.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow text-sand-light/55">
                          {i.label}
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-sand-light">
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
