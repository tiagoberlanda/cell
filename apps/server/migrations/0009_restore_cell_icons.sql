-- Restore coordinator and any legacy 'cell' agents to standard biological cell shapes.
UPDATE agents SET shape='animal',color='#f1f0e9' WHERE is_master;
UPDATE agents SET shape='ameba' WHERE shape='cell';
