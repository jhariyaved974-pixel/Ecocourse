'use client';

import * as React from 'react';
import { saveStoreSettings, type StoreSettingsInput } from '@/app/admin/(panel)/settings/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Panel } from '@/components/admin/ui';
import { AssetField } from '@/components/admin/catalog/asset-field';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Switch, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import type { MediaAssetSummary } from '@/lib/admin/types';

type Values = Omit<StoreSettingsInput, 'logoAssetId' | 'faviconAssetId' | 'ogImageAssetId' | 'lowStockThreshold' | 'freeReturnsDays' | 'cartReminderDelayHours'> & {
  lowStockThreshold: string;
  freeReturnsDays: string;
  cartReminderDelayHours: string;
};

export function StoreSettingsForm({ initial, logo, favicon, ogImage }: { initial: Values; logo: MediaAssetSummary | null; favicon: MediaAssetSummary | null; ogImage: MediaAssetSummary | null }) {
  const [v, setV] = React.useState<Values>(initial);
  const [assets, setAssets] = React.useState({ logo, favicon, ogImage });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { run, pending } = useActionRunner();
  const text = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const field = (k: keyof Values, label: string, opts: { hint?: string; max?: number; type?: string; textarea?: boolean; className?: string; required?: boolean } = {}) => (
    <Field label={label} htmlFor={`s-${k}`} hint={opts.hint} error={errors[k]} className={opts.className} required={opts.required}>
      {opts.textarea ? (
        <Textarea id={`s-${k}`} rows={2} maxLength={opts.max} value={String(v[k] ?? '')} onChange={text(k)} aria-invalid={errors[k] ? true : undefined} />
      ) : (
        <Input id={`s-${k}`} type={opts.type ?? 'text'} maxLength={opts.max} value={String(v[k] ?? '')} onChange={text(k)} aria-invalid={errors[k] ? true : undefined} />
      )}
    </Field>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setErrors({});
        const res = await run(() =>
          saveStoreSettings({ ...v, logoAssetId: assets.logo?.id ?? null, faviconAssetId: assets.favicon?.id ?? null, ogImageAssetId: assets.ogImage?.id ?? null }),
        );
        if (!res.ok) setErrors(res.fieldErrors ?? {});
      }}
    >
      {Object.keys(errors).length ? <Notice tone="danger">Please fix the highlighted fields.</Notice> : null}
      <Panel title="Store">
        <div className="grid gap-4 md:grid-cols-2">
          {field('storeName', 'Store name', { max: 60, required: true })}
          {field('legalName', 'Legal business name', { max: 120, hint: 'Shown on invoices and policy pages if set.' })}
          {field('tagline', 'Tagline', { max: 160, className: 'md:col-span-2' })}
          {field('supportEmail', 'Support email', { type: 'email', max: 254 })}
          {field('supportPhone', 'Support phone', { max: 20 })}
          {field('whatsappNumber', 'WhatsApp number', { max: 16, hint: 'With country code, digits only.' })}
          {field('address', 'Business address', { max: 500, textarea: true })}
        </div>
      </Panel>
      <Panel title="Brand & theme">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Theme" htmlFor="s-themePreset">
            <NativeSelect id="s-themePreset" value={v.themePreset} onChange={text('themePreset')}>
              <option value="noir">Noir (charcoal)</option>
              <option value="bone">Bone (off-white)</option>
              <option value="ember">Ember (warm)</option>
              <option value="forest">Forest (green)</option>
            </NativeSelect>
          </Field>
          <Field label="Accent colour" htmlFor="s-accentColor" error={errors.accentColor}>
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Pick accent colour" value={/^#[0-9A-Fa-f]{6}$/.test(v.accentColor) ? v.accentColor : '#000000'} onChange={(e) => setV((s) => ({ ...s, accentColor: e.target.value.toUpperCase() }))} className="h-11 w-12 rounded-lg border border-line-strong bg-surface" />
              <Input id="s-accentColor" value={v.accentColor} maxLength={7} onChange={text('accentColor')} className="font-mono uppercase" />
            </div>
          </Field>
          <Field label="Typography" htmlFor="s-fontPreset">
            <NativeSelect id="s-fontPreset" value={v.fontPreset} onChange={text('fontPreset')}>
              <option value="editorial">Editorial serif</option>
              <option value="modern">Modern sans</option>
              <option value="classic">Classic serif</option>
            </NativeSelect>
          </Field>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <AssetField label="Logo" value={assets.logo} onChange={(a) => setAssets((s) => ({ ...s, logo: a }))} uploadFolder="brand" hint="Shown instead of the store name when set." />
          <AssetField label="Favicon" value={assets.favicon} onChange={(a) => setAssets((s) => ({ ...s, favicon: a }))} uploadFolder="brand" hint="Square PNG, at least 64×64." />
          <AssetField label="Default share image" value={assets.ogImage} onChange={(a) => setAssets((s) => ({ ...s, ogImage: a }))} uploadFolder="brand" hint="1200×630, used when a page has none." />
        </div>
      </Panel>
      <Panel title="Search engines & social">
        <div className="grid gap-4 md:grid-cols-2">
          {field('seoTitle', 'Homepage title', { max: 70, required: true })}
          {field('seoTitleTemplate', 'Page title template', { max: 70, hint: '%s is replaced by the page title.' })}
          {field('seoDescription', 'Default description', { max: 170, textarea: true, className: 'md:col-span-2' })}
          {field('instagramUrl', 'Instagram', { max: 300 })}
          {field('facebookUrl', 'Facebook', { max: 300 })}
          {field('xUrl', 'X', { max: 300 })}
          {field('youtubeUrl', 'YouTube', { max: 300 })}
          {field('pinterestUrl', 'Pinterest', { max: 300 })}
        </div>
      </Panel>
      <Panel title="Footer">
        <div className="grid gap-4 md:grid-cols-2">
          {field('footerAbout', 'About text', { max: 400, textarea: true })}
          {field('footerNote', 'Legal note', { max: 200, textarea: true })}
        </div>
      </Panel>
      <Panel title="Operations">
        <div className="grid gap-4 md:grid-cols-3">
          {field('lowStockThreshold', 'Low-stock alert at', { max: 4, hint: 'Units available. Products can override it.' })}
          {field('orderNumberPrefix', 'Order number prefix', { max: 4, hint: 'e.g. AU → AU-261015-7K2QD' })}
          {field('freeReturnsDays', 'Size exchange window (days)', { max: 2 })}
        </div>
      </Panel>
      <Panel
        title="Cart reminders"
        description="One email to signed-in shoppers who opted in and left items in their cart. Shoppers choose this in their account and can turn it off from any reminder. Needs email delivery (Resend) to be configured."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={v.cartRemindersEnabled} onCheckedChange={(c) => setV((s) => ({ ...s, cartRemindersEnabled: c }))} aria-label="Cart reminders" />
            {v.cartRemindersEnabled ? 'Reminders on (for shoppers who opted in)' : 'Reminders off'}
          </label>
          {v.cartRemindersEnabled ? field('cartReminderDelayHours', 'Send after (hours without changes)', { max: 2, hint: 'Between 1 and 72. At most one reminder per cart and per week.' }) : null}
        </div>
      </Panel>
      <Panel title="Analytics" description="Only privacy-friendly, cookie-light analytics are supported. Leave off until you have a privacy notice that covers it.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Provider" htmlFor="s-analyticsProvider">
            <NativeSelect id="s-analyticsProvider" value={v.analyticsProvider} onChange={text('analyticsProvider')}>
              <option value="none">Off</option>
              <option value="plausible">Plausible</option>
              <option value="ga4">Google Analytics 4</option>
            </NativeSelect>
          </Field>
          {v.analyticsProvider !== 'none' ? field('analyticsId', v.analyticsProvider === 'plausible' ? 'Plausible site domain' : 'GA4 measurement ID', { max: 80 }) : null}
        </div>
      </Panel>
      <Panel title="Maintenance mode" description="Shows a maintenance page to shoppers. The admin panel keeps working.">
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={v.maintenanceMode} onCheckedChange={(c) => setV((s) => ({ ...s, maintenanceMode: c }))} aria-label="Maintenance mode" />
            {v.maintenanceMode ? 'Store is in maintenance mode' : 'Store is open'}
          </label>
          {v.maintenanceMode ? <Notice tone="warning">Shoppers will not be able to browse or check out while this is on.</Notice> : null}
          {field('maintenanceMessage', 'Message for visitors', { max: 300, textarea: true })}
        </div>
      </Panel>
      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={pending} className="shadow-lg">Save settings</Button>
      </div>
    </form>
  );
}
