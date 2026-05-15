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

typedef struct { int32_t _state; int _result; bool _done; getValue_state _await_0; } main_state;

static void main_poll(main_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (getValue_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            getValue_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            const int32_t y = x * 2;
            printf("%d\n", y);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    main_state _main_sm = {0};
    while (!_main_sm._done) {
        main_poll(&_main_sm);
    }
    return 0;
}
