#include "runtime.h"
#include "std/net.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    TscUdpSocket udp;
    TscUdpBindAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->udp = tsc_udp_create();
            self->_await_0 = tsc_udp_bind_async(&self->udp, 9000);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_udp_bind_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
