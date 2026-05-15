#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } a_state;

static void a_poll(a_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 1;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; } b_state;

static void b_poll(b_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 2;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int _result; bool _done; a_state _await_0; b_state _await_1; } main_state;

static void main_poll(main_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (a_state){0};
            self->_await_1 = (b_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            a_poll(&self->_await_0);
            b_poll(&self->_await_1);
            if (!self->_await_0._done || !self->_await_1._done) return;
            int32_t x = self->_await_0._result;
            int32_t y = self->_await_1._result;
            printf("%d\n", x + y);
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
