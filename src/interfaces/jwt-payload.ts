export interface JwtPayload {
    "sub": number;
    "username": string;
    "isPermitted": string;
    "iat": number;
    "exp": number;
}