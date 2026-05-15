#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } tick_state;

static void tick_poll(tick_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 1;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    int32_t n;
    int32_t count;
    tick_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->count = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(self->count < self->n)) {
                self->_result = self->count;
                self->_done = true;
                return;
            }
            self->_await_0 = (tick_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            tick_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->count = self->count + v;
            self->_state = 1;
            goto case_1;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
