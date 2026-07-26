# Free trial → Dolibarr third party

LectiHub `POST /api/trial-requests` sends a Prospect to Dolibarr using this shape
(see `dolibarr-free-trial.example.json`):

```json
{
  "name": "Alex Rivera",
  "email": "alex.rivera@example.com",
  "client": "2",
  "code_client": "-1",
  "array_options": {
    "options_program": "Data Analytics",
    "options_preferred_date": "2026-07-28",
    "options_time_slot": "10:30-11:00",
    "options_video_platform": "Google Meet"
  }
}
```

## Headers

```json
{
  "DOLAPIKEY": "<from LectiHub-server/.env>",
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true"
}
```

## Important for the Dolibarr admin

If **Program / pref_time / video_platform** columns stay blank in the Third parties list,
those extrafields are probably still **Select** types with placeholder options
(`p1`, `slot1`, `gmeet`).

For the human-readable free-trial values to display in the list:

1. Change `program`, `pref_time`, and `video_platform` to **Text / varchar**  
   **or**
2. Rename/create extrafields to match the sample keys:
   - `preferred_date` (date)
   - `time_slot` (varchar)
   - `program` (varchar)
   - `video_platform` (varchar)

LectiHub also writes `options_pref_date` / `options_pref_time` for the current
field codes on this Dolibarr instance, plus name, email, alias (email), phone,
and company/individual type.
