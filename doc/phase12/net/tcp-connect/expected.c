#include "runtime.h"
#include "std/net.h"

typedef struct {
    int32_t _state; bool _done; int _result;
    TscSocket sock;
    TscConnectAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_net_connect_async(STR_LIT("127.0.0.1"), 8080);
            self->_state = 1;
        case 1:
            tsc_net_connect_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->sock = self->_await_0._result;
            tsc_socket_close(&self->sock);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
