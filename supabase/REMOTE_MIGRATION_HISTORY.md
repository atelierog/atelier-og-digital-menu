# Remote Supabase migration history — recovery record

Captured from the live Supabase project `qwyquvufneolyesfiipf` on 2026-11-14.

The live database reports **22 applied migrations**:

| Applied version | Applied name |
|---|---|
| 20260923072145 | reset_legacy_database |
| 20260923072207 | business_os_foundation |
| 20260923072229 | remove_legacy_functions |
| 20260923094232 | harden_rls_and_indexes |
| 20260923192219 | admin_workspace_access_and_role_hardening |
| 20260923192328 | integrity_and_timestamp_hardening |
| 20260923192353 | composite_foreign_key_indexes |
| 20260923192445 | split_management_policies_by_operation |
| 20260923192524 | centralize_member_inserts |
| 20261027131406 | restore_authenticated_table_grants_for_super_admin |
| 20261027135655 | fix_super_admin_function_permissions |
| 20261027152524 | grant_service_role_business_table_access |
| 20261027162701 | add_manager_staff_roles |
| 20261108165540 | restaurant_ordering_foundation_20261108 |
| 20261108182245 | manager_catalog_permissions_20261108 |
| 20261108182620 | grant_authenticated_module_check_20261108 |
| 20261110090832 | manager_module_data_access_20261110 |
| 20261110093436 | grant_public_menu_reads_service_role_20261110 |
| 20261110113500 | add_food_catalog_type |
| 20261110142054 | staff_id_login_and_resets |
| 20261110154405 | stream_orders_to_realtime |
| 20261114082139 | 20261114100000_harden_module_entitlements_and_fk_indexes |

## Repository comparison

The checked Git branches originally contained only these two migration SQL files; this recovery branch now also contains the exact SQL for the new 22nd migration:

- `20261027_restaurant_ordering_foundation.sql`
- `20261027163000_add_manager_staff_roles.sql`

Neither filename is an exact version/name match for the corresponding live records (`20261108165540_restaurant_ordering_foundation_20261108` and `20261027162701_add_manager_staff_roles`). The 21 historical applied SQL files (before the new 22nd migration) were not found in any of the ten checked repository branches or their migration directories.

**Do not rename these two files to pretend they are the applied versions. Do not create no-op placeholders and do not mark missing versions applied.** The live schema, constraints, indexes, policies and functions must be used to build a reviewed schema snapshot or recover the original SQL from the original authoring environment/backups. Until then, this file is an inventory, not a replacement migration history.

The new migration is tracked as `20261114082139_20261114100000_harden_module_entitlements_and_fk_indexes.sql` and **has been applied to production**. Post-application verification confirmed Super Admin-only insert/update/delete policies on `business_modules`, the new `admin_set_business_modules` SECURITY DEFINER RPC, and all three intended foreign-key indexes. The `business_modules` table still contains 11 rows (all enabled); the migration did not delete or alter business-module records.
