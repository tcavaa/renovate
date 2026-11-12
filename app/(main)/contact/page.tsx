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
      <section className="relative overflow-hidden">
        <span className="pointer-events-none absolute -bottom-10 left-[5%] hidden h-40 w-40 rounded-full bg-cobalt md:block" aria-hidden />
        <span className="pointer-events-none absolute left-[13%] top-12 hidden h-10 w-10 bg-sun lg:block" aria-hidden />
        <span className="pointer-events-none absolute -bottom-8 right-[6%] hidden h-48 w-28 bg-lilac md:block" aria-hidden />
        <span className="pointer-events-none absolute -bottom-10 right-[12%] hidden h-24 w-24 bg-coral lg:block" aria-hidden />
        <div className="container relative py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <LogoMark tone="ink" className="mx-auto mb-7 h-14 w-14" />
            <h1 className="display text-[clamp(2.6rem,5.6vw,4.8rem)] text-ink">
              {ka.pages.contact.title}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-xl font-semibold leading-snug tracking-tight text-ink-soft md:text-2xl">
              {ka.pages.contact.subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Form + Info */}
      <section className="container pb-20">
        <div className="grid gap-6 md:grid-cols-5 md:gap-8">
          <div className="md:col-span-3">
            <Card className="rounded-3xl">
              <CardContent className="p-6 md:p-10">
                <h2 className="mb-7 font-display text-3xl">
                  {ka.pages.contact.formTitle}
                </h2>
                <ContactForm />
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card className="relative h-full overflow-hidden rounded-3xl border-0 bg-ink text-white">
              {/* A violet quarter circle and a lime square behind the list. */}
              <span className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-brand" aria-hidden />
              <span className="pointer-events-none absolute bottom-8 right-28 h-8 w-8 bg-lime" aria-hidden />
              <CardContent className="relative p-6 md:p-10">
                <h2 className="mb-7 font-display text-3xl text-white">
                  {ka.pages.contact.infoTitle}
                </h2>
                <ul className="space-y-5">
                  {info.map((i) => (
                    <li key={i.label} className="flex items-start gap-3.5">
                      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-ink">
                        <i.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow text-white/55">
                          {i.label}
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-white">
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
