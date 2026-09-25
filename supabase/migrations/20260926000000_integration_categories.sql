-- Integrations are matched by capability (a CRM, an email inbox...), so users can
-- connect whichever tool they use. `provider` becomes the tool's display name.
-- Categories: src/lib/catalog/integrations.ts.
alter table public.integrations add column category text;

update public.integrations set
  category = case provider
    when 'gmail' then 'email'
    when 'hubspot' then 'crm'
    when 'salesforce' then 'crm'
    when 'linkedin' then 'social'
    when 'slack' then 'team_chat'
    when 'shopify' then 'store'
    when 'ga4' then 'analytics'
    when 'meta_ads' then 'social_ads'
    when 'google_ads' then 'search_ads'
  end,
  provider = case provider
    when 'gmail' then 'Gmail'
    when 'hubspot' then 'HubSpot'
    when 'salesforce' then 'Salesforce'
    when 'linkedin' then 'LinkedIn'
    when 'slack' then 'Slack'
    when 'shopify' then 'Shopify'
    when 'ga4' then 'Google Analytics'
    when 'meta_ads' then 'Meta Ads'
    when 'google_ads' then 'Google Ads'
    else provider
  end;

delete from public.integrations where category is null;
alter table public.integrations alter column category set not null;
