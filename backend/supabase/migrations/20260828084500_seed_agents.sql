-- Seed the four agent identities (md 4).
--
-- These DID + public-key values come from `backend/.keys/agents.json`, produced
-- by `npm run keys:gen`. The matching PRIVATE keys never leave that file. If the
-- keypairs are ever regenerated (`npm run keys:gen -- --force`), re-sync this
-- row set with `npm run db:push` (the service-role seeder), otherwise stored
-- signatures will fail to verify.
--
-- Idempotent: upsert on the unique `role`.

insert into agents (name, role, did, public_key) values
  ('Planner',  'planner',  'did:key:z6Mkow2GP3mkk3VhoBx6P34Pt9NzACxVbN2cTd96rvtKNFhY', 'zAUmDnoXKQW1Egh7PhU6Z33pzLdgeBUnFmcEB2evJT2vA'),
  ('Coder',    'coder',    'did:key:z6MkfkQRVXnusDwFbtiuaLGidHGanHY6PZsSDWiYpQbHZxbV', 'z2J9NuHYUXgSnVPtCtmJsnBiaxiGEygd5XVocz8dGejp7'),
  ('Tester',   'tester',   'did:key:z6MkiEiC1jodfbdtfzxbrH7CHv7CigusAAKm7CA2qsA2rib5', 'z4nT9RVZCL49RZW7uAi9MSpZCu7e1kH5QRBF71bC1wVoh'),
  ('Reviewer', 'reviewer', 'did:key:z6MkexvqYKLNR6P9AcEacMJuobEoi2zApEo524pzwgVThNZE', 'zWfnx55w5Ytg47PsvnM4xVgotTiKQMYiL3v57QXSn9mr')
on conflict (role) do update
  set name = excluded.name,
      did = excluded.did,
      public_key = excluded.public_key;
