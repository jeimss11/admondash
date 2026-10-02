"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembershipInputError = exports.MEMBERSHIP_ROLES = void 0;
exports.normalizeEmail = normalizeEmail;
exports.resolveRole = resolveRole;
exports.permissionsFor = permissionsFor;
exports.MEMBERSHIP_ROLES = ['consulta', 'operador', 'administrador'];
const ROLE_PERMISSIONS = {
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
function normalizeEmail(value) {
    if (typeof value !== 'string')
        throw new MembershipInputError('invalid-argument', 'El correo es obligatorio.');
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new MembershipInputError('invalid-argument', 'El correo no tiene un formato válido.');
    }
    return email;
}
function resolveRole(value) {
    if (typeof value !== 'string' || !exports.MEMBERSHIP_ROLES.includes(value)) {
        throw new MembershipInputError('invalid-argument', 'El rol solicitado no está permitido.');
    }
    return value;
}
function permissionsFor(role) {
    return { ...ROLE_PERMISSIONS[role] };
}
class MembershipInputError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MembershipInputError';
    }
}
exports.MembershipInputError = MembershipInputError;
//# sourceMappingURL=membership-policy.js.map