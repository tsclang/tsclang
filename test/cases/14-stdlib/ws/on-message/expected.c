#include "runtime.h"
#include "std/ws.h"

static void _lambda_0_void(String msg) {
    printf("%s\n", msg.data);
}

int main(void) {
    TSC_INIT();
    TscWebSocket ws = tsc_ws_connect(STR_LIT("ws://localhost:8080"));
    tsc_ws_on_message(&ws, _lambda_0_void);
    return 0;
}
