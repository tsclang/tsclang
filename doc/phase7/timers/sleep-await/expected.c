#include "runtime.h"

typedef struct {
    int32_t _state;
    int _result;
    bool _done;
    TscSleepAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_sleep_awaitable(100);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_sleep_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            printf("after sleep\n");
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
