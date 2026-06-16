#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } getValue_state;

static void getValue_poll(getValue_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 42;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; getValue_state _await_0; } caller_state;

static void caller_poll(caller_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (getValue_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            getValue_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t v = self->_await_0._result;
            self->_result = v;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
