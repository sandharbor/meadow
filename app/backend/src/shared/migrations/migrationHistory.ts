/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Logical IDs that shipped in private Meadow builds but whose source files no
 * longer run. Keeping the allowlist explicit lets genuine unknown IDs block
 * while preserving real pre-public-release ledgers.
 */
const RETIRED_CORE_MIGRATION_IDS = [
  '25_12_05_09_03_23_zpnysy7x8wsf_add_source_graph_subdirectory',
  '25_12_06_08_26_38_t24kki4i6rak_normalize_site_node_conf_yaml_format',
  '25_12_07_10_30_00_kx8m2jfr9p4w_add_file_type',
  '25_12_08_11_01_19_3a3cbb0b25b7_sort_site_node_conf_deterministically',
  '25_12_14_17_30_00_r8x9m2jf3p4w_rename_to_site_node_fields',
  '25_12_14_17_30_00_r8x9m2jf3p4w_rename_to_site_page_fields',
  '25_12_17_01_40_00_d8x9m2jf3p4w_remove_duplicate_configs',
  '25_12_22_15_05_44_1dbd60968f64_rename_config_files',
  '25_12_24_12_00_00_p3k7m1z9x2q8_add_site_guid',
  '25_12_26_12_00_00_a1b2c3d4e5f6_move_app_files_into_app_dir',
  '25_12_28_12_00_00_k3p9x1m7q2z8_add_publish_option_defaults_to_app_config',
  '25_12_31_12_00_00_b7g1t9c2h3k4_add_manage_git_automatically_default_to_app_config',
  '26_01_17_17_31_45_fFoMSRQtQPZg_migrate_to_application_support',
  '26_01_21_10_42_00_x9p3m7k2w1q8_rename_node_to_page_config',
  '26_01_21_12_00_00_pagerename1_rename_node_to_page_config',
  '26_01_21_12_00_00_some_example',
  '26_01_28_12_00_00_rename_page_name_to_page_title_hook',
  '26_04_11_12_00_00_a1b2c3d4e5f6_rename_graph_depth_to_outlinks_depth',
  // This migration originally lived in the core ledger before provider scopes.
  '26_04_22_10_00_00_u6sotb1nmvag_move_meadow_to_provider',
  '26_06_03_12_00_00_d9f0a1b2c3d4_remove_generated_tag_page_configs',
  '26_08_11_12_00_00_n4k7p2w9c5x8_site_node_foundation',
  '26_08_13_12_00_00_f3m8q1v6z2k9_rename_preview_output_to_generated',
  '26_08_13_13_00_00_b7n2r5k8w4q1_rename_sites_to_bundles',
  '26_08_14_13_00_00_c4g7m2p9v6x1_rename_bundle_conf_to_config',
  '26_08_16_18_30_00_q7m2v9k4c6x1_generated_bundle_versioning',
  '26_08_17_11_00_00_r4m8v2k7c5x1_harden_provider_secret_files',
  '26_08_17_13_00_00_m6q2v8k4p7x1_rename_custom_filter_scope',
] as const;

export function retiredMigrationIdsForScope(scope: string): ReadonlySet<string> {
  return scope === 'core' ? new Set(RETIRED_CORE_MIGRATION_IDS) : new Set();
}
