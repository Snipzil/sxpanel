import type { ParameterizedContext } from 'koa';
import type { CtxTxVars } from '@modules/WebServer/middlewares/ctxVarsMw';
import type { CtxTxUtils } from '@modules/WebServer/middlewares/ctxUtilsMw';
import type { AuthedAdminType } from '@modules/WebServer/authLogic';
import type { SessToolsType } from '@modules/WebServer/middlewares/sessionMws';
import { Socket } from 'socket.io';

//Right as it comes from Koa
export type RawKoaCtx = ParameterizedContext<
    { [key: string]: unknown }, //state
    { [key: string]: unknown }, //context
    unknown //response
>;

//After passing through the libs (session, serve, body parse, etc)
export type CtxWithSession = RawKoaCtx & {
    sessTools: SessToolsType;
    request: any;
};

//After setupVarsMw
export type CtxWithVars = CtxWithSession & {
    txVars: CtxTxVars;
};

//After setupUtilsMw
export type InitializedCtx = CtxWithVars & CtxTxUtils;

//After some auth middleware
export type AuthedCtx = InitializedCtx & {
    admin: AuthedAdminType;
    params: any;
    request: any;
};

//The socket.io version of "context"
export type SocketWithSession = Socket & {
    sessTools: SessToolsType;
};
