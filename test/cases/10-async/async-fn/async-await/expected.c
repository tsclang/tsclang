#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } delay_state;

static void delay_poll(delay_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 10;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; delay_state _await_0; } run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (delay_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            delay_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t x = self->_await_0._result;
            self->_result = x + 1;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
