import 'server-only';
// Shared select lists so every page asks for the same shape.
export const PROJECT_SELECT = '*, organization:organizations(id,name), manager:team_members(id,full_name,title,email), project_services(service:services(id,name,slug))';
export const FILE_SELECT = '*, project:projects(id,name), organization:organizations(id,name)';
