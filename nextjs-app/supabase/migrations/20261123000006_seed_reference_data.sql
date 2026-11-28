-- Pakistan Jobs Portal — migration 6: reference data (categories, blog categories, default settings).
-- Urdu names are drafted UI labels and should be reviewed by a native speaker (see docs/i18n in context.md).

insert into public.job_categories (slug, name_en, name_ur, sort_order) values
  ('government-administration', 'Government & Administration', 'سرکاری و انتظامی', 10),
  ('education-teaching',        'Education & Teaching',        'تعلیم و تدریس', 20),
  ('engineering-technical',     'Engineering & Technical',     'انجینئرنگ و تکنیکی', 30),
  ('clerical-office',           'Clerical & Office',           'کلیریکل و دفتری', 40),
  ('information-technology',    'Information Technology',      'انفارمیشن ٹیکنالوجی', 50),
  ('healthcare',                'Healthcare & Medical',        'صحت و طب', 60),
  ('sales-marketing',           'Sales & Marketing',           'سیلز اور مارکیٹنگ', 70),
  ('accounting-finance',        'Accounting & Finance',        'اکاؤنٹنگ اور فنانس', 80),
  ('police-security',           'Police, Army & Security',     'پولیس، فوج اور سکیورٹی', 90),
  ('driving-logistics',         'Driving & Logistics',         'ڈرائیونگ اور لاجسٹکس', 100),
  ('hospitality',               'Hospitality & Food',          'مہمان نوازی اور کھانا', 110),
  ('construction-labour',       'Construction & Labour',       'تعمیرات اور مزدوری', 120),
  ('other',                     'Other',                       'دیگر', 999)
on conflict (slug) do nothing;

insert into public.blog_categories (slug, name_en, name_ur, sort_order) values
  ('career-guides',          'Career Guides',          'کیریئر گائیڈز', 10),
  ('interview-preparation',  'Interview Preparation',  'انٹرویو کی تیاری', 20),
  ('resume-writing',         'Resume Writing',         'ریزیومے لکھنا', 30),
  ('salary-guides',          'Salary Guides',          'تنخواہ گائیڈز', 40),
  ('education-guides',       'Education Guides',       'تعلیمی گائیڈز', 50),
  ('job-search-tips',        'Job Search Tips',        'ملازمت تلاش کرنے کے مشورے', 60)
on conflict (slug) do nothing;

insert into public.site_settings (key, value) values
  ('general', '{"siteName":"Pakistan Jobs Blog","contactEmail":"","supportPhone":"","twitter":"","facebook":""}'),
  ('seo',     '{"defaultTitle":"Pakistan Jobs Blog — Govt & Private Jobs in Pakistan","defaultDescription":"Government and private jobs in Pakistan, checked against official advertisements, with real last dates and direct apply links.","ogImage":""}'),
  ('adsense', '{"enabled":false,"publisherId":"","slots":{"topBanner":"","inFeed":"","inArticle":"","sidebar":""},"adsTxt":""}')
on conflict (key) do nothing;
