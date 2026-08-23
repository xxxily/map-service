export const PERMISSIONS = Object.freeze([
  ['account.self.read', '查看个人账号'],
  ['account.self.update', '修改个人账号'],
  ['session.self.manage', '管理个人会话'],
  ['kml.own.read', '查看个人 KML'],
  ['kml.own.write', '管理个人 KML'],
  ['share.own.manage', '管理个人分享'],
  ['favorite.own.manage', '管理个人收藏'],
  ['admin.overview.read', '查看后台概览'],
  ['admin.cache.manage', '管理缓存'],
  ['admin.precache.manage', '管理预缓存任务'],
  ['admin.layer.manage', '管理图源、图层和代理'],
  ['admin.public_kml.manage', '管理公共 KML 图层'],
  ['admin.share.moderate', '治理用户分享'],
  ['admin.audit.read', '查看审计日志'],
  ['admin.user.read', '查看用户列表'],
  ['admin.user.manage', '管理用户'],
  ['admin.role.manage', '管理角色和权限'],
  ['admin.registration.manage', '管理注册策略'],
  ['admin.security.manage', '管理安全策略'],
  ['admin.comment.read', '查看留言'],
  ['admin.comment.moderate', '审核和处理留言'],
  ['admin.comment.policy.manage', '管理留言策略'],
  ['admin.moderation.ai.manage', '管理 AI 审核配置'],
  ['admin.moderation.keyword.manage', '管理关键词审核规则'],
  ['admin.report.read', '查看内容举报'],
  ['admin.report.manage', '处理内容举报'],
  ['kml.any.read', '读取任意用户 KML'],
  ['kml.any.manage', '管理任意用户 KML'],
  ['system.super_admin', '超级管理员根权限'],
].map(([code, name]) => Object.freeze({ code, name })))

export const USER_PERMISSIONS = Object.freeze([
  'account.self.read',
  'account.self.update',
  'session.self.manage',
  'kml.own.read',
  'kml.own.write',
  'share.own.manage',
  'favorite.own.manage',
])

export const ADMIN_PERMISSIONS = Object.freeze([
  ...USER_PERMISSIONS,
  'admin.overview.read',
  'admin.cache.manage',
  'admin.precache.manage',
  'admin.layer.manage',
  'admin.public_kml.manage',
  'admin.share.moderate',
  'admin.audit.read',
  'admin.comment.read',
  'admin.comment.moderate',
  'admin.report.read',
  'admin.report.manage',
])

export const SUPER_ADMIN_PERMISSIONS = Object.freeze(PERMISSIONS.map(item => item.code))

export const BUILTIN_ROLES = Object.freeze([
  Object.freeze({
    id: 'role_user',
    code: 'user',
    name: '普通用户',
    description: '管理自己的 KML、收藏、分享和账号安全',
    permissions: USER_PERMISSIONS,
  }),
  Object.freeze({
    id: 'role_admin',
    code: 'admin',
    name: '管理员',
    description: '负责地图应用日常运维和公共数据维护',
    permissions: ADMIN_PERMISSIONS,
  }),
  Object.freeze({
    id: 'role_super_admin',
    code: 'super_admin',
    name: '超级管理员',
    description: '拥有全部业务管理权限',
    permissions: SUPER_ADMIN_PERMISSIONS,
  }),
])

export function isKnownPermission (code) {
  return PERMISSIONS.some(item => item.code === code)
}
