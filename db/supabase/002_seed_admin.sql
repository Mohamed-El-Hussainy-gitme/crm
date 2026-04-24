-- Smart CRM minimal seed for Supabase
-- Default login:
--   email: admin@smartcrm.local
--   password: Admin123!

BEGIN;

INSERT INTO "User" ("id", "fullName", "email", "passwordHash", "role", "createdAt", "updatedAt")
VALUES (
  'seed_admin_user',
  'Supabase Admin',
  'admin@smartcrm.local',
  '$argon2id$v=19$m=65536,t=3,p=4$4nc2n7e0a/A/LjdeowjGSw$B8q+mDyguRlTakSRZa7Z2/eGcQKISxYV8G/zP5eWGA0',
  'ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "AppSetting" ("id", "key", "value", "updatedAt", "createdAt")
VALUES (
  'seed_crm_settings',
  'crm_settings',
  jsonb_build_object(
    'pipelineStages', jsonb_build_array('LEAD', 'INTERESTED', 'POTENTIAL', 'CLIENT', 'ON_HOLD', 'LOST'),
    'dealStages', jsonb_build_array('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD'),
    'contactSources', jsonb_build_array('WhatsApp', 'Referral', 'Website', 'Call', 'Walk-in'),
    'lostReasons', jsonb_build_array('No budget', 'No reply', 'Not fit', 'Competitor'),
    'tags', jsonb_build_array('new', 'hot', 'whatsapp', 'referral'),
    'reminderPresets', jsonb_build_array(1, 3, 7),
    'whatsappTemplates', jsonb_build_array(
      jsonb_build_object('name', 'follow_up', 'body', 'مرحبًا، نود متابعة طلبك ومشاركة الخطوة التالية.'),
      jsonb_build_object('name', 'payment_reminder', 'body', 'تذكير ودي بوجود دفعة مستحقة، يسعدنا مساعدتك.')
    )
  ),
  NOW(),
  NOW()
)
ON CONFLICT ("key") DO NOTHING;

COMMIT;
