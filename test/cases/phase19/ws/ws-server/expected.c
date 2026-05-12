#include "runtime.h"
#include "std/ws.h"

static void _lambda_0_void(TscWebSocket *ws) {
    tsc_ws_send(ws, STR_LIT("hello"));
}

int main(void) {
    TSC_INIT();
    TscWebSocketServer server = tsc_ws_server_create();
    tsc_ws_server_on_connect(&server, _lambda_0_void);
    tsc_ws_server_listen(&server, 8080);
    return 0;
}
