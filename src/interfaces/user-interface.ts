export interface User {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    phone: number
    email: string;
    password: string;
    isPermitted: number;
}
export interface newUser {
    username: string;
    firstName: string;
    lastName: string;
    phone: number
    email: string;
    password: string;
}