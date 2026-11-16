#include "runtime.h"
#include "std/ws.h"

static void _lambda_0_void(void *_env) {
    printf("closed\n");
}

static void _lambda_0_void_adapter(void) {
    _lambda_0_void(((void *)0));
}

int main(void) {
    TSC_INIT();
    TscWebSocket ws = tsc_ws_connect(STR_LIT("ws://localhost:8080"));
    tsc_ws_on_close(&ws, _lambda_0_void_adapter);
    return 0;
}
