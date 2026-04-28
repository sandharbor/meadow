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
 * Limits and constants for publishing sites to S3
 */

/**
 * Maximum file size allowed for publishing (in bytes).
 * Files larger than this will cause the publish to fail.
 * 
 * 4MB limit chosen because:
 * - S3 ETags for files <= 5MB are simple MD5 hashes (allows efficient diff comparison)
 * - Most HTML/CSS/JS/image files are well under this limit
 * - Large files like videos should be hosted separately
 */
export const MAX_PUBLISHABLE_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * Human-readable version of the limit for display in UI
 */
export const MAX_PUBLISHABLE_FILE_SIZE_DISPLAY = '4MB';
