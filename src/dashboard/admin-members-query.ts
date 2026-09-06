export const memberDirectorySelect = `
  id,
  email,
  full_name,
  auth_user_id,
  is_active,
  created_at,
  memberships:semester_memberships(id,role,status,semester_id,semester:semesters(is_active)),
  platform_roles!platform_roles_profile_id_fkey(role)
`;
