#include "runtime.h"
#include "std/net.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    TscSocket sock;
    String line;
    TscConnectAwaitable _await_0;
    TscSocketReadLineAwaitable _await_1;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_net_connect_async(STR_LIT("127.0.0.1"), 8080);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_net_connect_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->sock = self->_await_0._result;
            self->_await_1 = tsc_socket_readline_async(&self->sock);
            self->_state = 2;
            /* fall through */
        case 2:
            tsc_socket_readline_poll(&self->_await_1);
            if (!self->_await_1._done) return;
            self->line = self->_await_1._result;
            printf("%s\n", self->line.data);
            tsc_socket_close(&self->sock);
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->line);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
