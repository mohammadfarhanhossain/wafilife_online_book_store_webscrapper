INSERT INTO sources (code, name, base_url)
VALUES
  ('csv_legacy', 'Legacy CSV import', NULL),
  ('wafilife', 'Wafilife', 'https://www.wafilife.com'),
  ('rokomari', 'Rokomari', 'https://www.rokomari.com')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  base_url = VALUES(base_url),
  is_active = TRUE;