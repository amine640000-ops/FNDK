import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import type { AccessTokenPayload, UserRole } from "@nevo/shared-types";

const PUBLIC_KEY = "isPublic";
const ROLES_KEY = "roles";

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload;
};

const getMetadata = <T>(key: string, context: ExecutionContext): T | undefined =>
  (Reflect.getMetadata(key, context.getHandler()) as T | undefined) ??
  (Reflect.getMetadata(key, context.getClass()) as T | undefined);

const getTokenFromRequest = (request: RequestWithUser) => {
  const authorization = request.headers.authorization;
  if (!authorization || Array.isArray(authorization)) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

const verifyToken = (token: string) => {
  const secret = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
  return jwt.verify(token, secret) as AccessTokenPayload;
};

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const isPublic = getMetadata<boolean>(PUBLIC_KEY, context);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = getTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = verifyToken(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const requiredRoles = getMetadata<UserRole[]>(ROLES_KEY, context);
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException("Authentication required");
    }

    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException("Insufficient role");
    }

    return true;
  }
}

export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException("Authentication required");
    }

    if (request.user.role !== "ADMIN") {
      throw new ForbiddenException("Admin role required");
    }

    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
});
