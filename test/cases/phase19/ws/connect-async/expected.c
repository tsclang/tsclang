#include "runtime.h"
#include "std/ws.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    TscWebSocket ws;
    TscWsConnectAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_ws_connect_async(STR_LIT("ws://localhost:8080"));
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_ws_connect_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->ws = self->_await_0._result;
            tsc_ws_close(&self->ws);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
