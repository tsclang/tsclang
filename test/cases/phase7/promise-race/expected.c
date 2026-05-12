#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } fast_state;

static void fast_poll(fast_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 1;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; } slow_state;

static void slow_poll(slow_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 2;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int _result; bool _done;
    int32_t x;
    fast_state _await_0;
    slow_state _await_1;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (fast_state){0};
            self->_await_1 = (slow_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            fast_poll(&self->_await_0);
            slow_poll(&self->_await_1);
            if (!self->_await_0._done && !self->_await_1._done) return;
            self->x = self->_await_0._done ? self->_await_0._result : self->_await_1._result;
            printf("%d\n", self->x);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
