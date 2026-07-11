# Audited upstream references

Orbix Next was rebuilt without reading or copying any prior local Orbix implementation.
The architecture audit used these fresh, shallow GitHub checkouts:

| Project | Repository | Audited commit | Used for |
|---|---|---|---|
| HAPI | https://github.com/tiann/hapi | `b44885ae676652db2905e8cab6d8331a67adad6e` | AGPL implementation foundation, native provider integrations, PWA/hub architecture |
| Happy | https://github.com/slopus/happy | `d2ef88deffa337546f0c477f28385d470188cb38` | E2E sync and mobile notification design review |
| Paseo | https://github.com/getpaseo/paseo | `4c72bf02095ac21ed989f5a0d38e0fae589da4e4` | Provider registry, daemon/client and cross-device UX review |

The checkouts are intentionally excluded from the Orbix repository. Their licenses remain authoritative for their own source trees.
