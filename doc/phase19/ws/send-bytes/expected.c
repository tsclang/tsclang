#include "runtime.h"
#include "std/ws.h"

static uint8_t _lit_0[] = {1, 2, 3};
static const Array_u8 data = {.data = _lit_0, .length = 3, .capacity = 3};

int main(void) {
    TSC_INIT();
    TscWebSocket ws = tsc_ws_connect(STR_LIT("ws://localhost:8080"));
    tsc_ws_send_bytes(&ws, data.data, data.length);
    return 0;
}
