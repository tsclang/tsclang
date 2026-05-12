#include "runtime.h"
#include "std/ws.h"

int main(void) {
    TSC_INIT();
    TscWebSocket ws = tsc_ws_connect(STR_LIT("ws://localhost:8080"));
    uint8_t _lit_0[] = {0x01, 0x02, 0x03};
    const Array_u8 data = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_ws_send_bytes(&ws, data.data, data.length);
    return 0;
}
