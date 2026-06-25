#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } getValue_state;

static void getValue_poll(getValue_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 10;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t code; getValue_state _await_0; } handle_state;

static void handle_poll(handle_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (getValue_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            getValue_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t x = self->_await_0._result;
            if (x == 10) {
                self->_result = 100;
                self->_done = true;
                return;
            } else if (x == 20) {
                self->_result = 200;
                self->_done = true;
                return;
            } else {
                self->_result = 0;
                self->_done = true;
                return;
            }
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
