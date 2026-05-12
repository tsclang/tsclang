#include "runtime.h"
#include "std/ws.h"

int main(void) {
    TSC_INIT();
    TscWebSocket ws = tsc_ws_connect(STR_LIT("ws://localhost:8080"));
    tsc_ws_close(&ws);
    return 0;
}
