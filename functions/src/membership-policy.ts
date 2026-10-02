export const MEMBERSHIP_ROLES = ['consulta', 'operador', 'administrador'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type PermissionMap = Record<string, boolean>;

const ROLE_PERMISSIONS: Record<MembershipRole, PermissionMap> = {
  consulta: {
    'catalogo.leer': true,
    'clientes.leer': true,
    'reportes.leer': true,
  },
  operador: {
    'catalogo.leer': true,
    'clientes.leer': true,
    'ventas.leer': true,
    'reportes.leer': true,
  },
  administrador: {
    'catalogo.leer': true,
    'clientes.leer': true,
    'ventas.leer': true,
    'gastos.leer': true,
    'proveedores.leer': true,
    'caja.leer': true,
    'reportes.leer': true,
  },
};

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new MembershipInputError('invalid-argument', 'El correo es obligatorio.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MembershipInputError('invalid-argument', 'El correo no tiene un formato válido.');
  }
  return email;
}

export function resolveRole(value: unknown): MembershipRole {
  if (typeof value !== 'string' || !MEMBERSHIP_ROLES.includes(value as MembershipRole)) {
    throw new MembershipInputError('invalid-argument', 'El rol solicitado no está permitido.');
  }
  return value as MembershipRole;
}

export function permissionsFor(role: MembershipRole): PermissionMap {
  return { ...ROLE_PERMISSIONS[role] };
}

export class MembershipInputError extends Error {
  constructor(
    readonly code: 'invalid-argument' | 'failed-precondition',
    message: string
  ) {
    super(message);
    this.name = 'MembershipInputError';
  }
}
