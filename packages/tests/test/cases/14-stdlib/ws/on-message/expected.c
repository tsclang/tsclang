#include "runtime.h"
#include "std/ws.h"

static void _lambda_0_void(void *_env, String msg) {
    printf("%s\n", msg.data);
}

static void _lambda_0_void_adapter(String _p0) {
    _lambda_0_void(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    TscWebSocket ws = tsc_ws_connect(STR_LIT("ws://localhost:8080"));
    tsc_ws_on_message(&ws, _lambda_0_void_adapter);
    return 0;
}
