#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } getValue_state;
static void getValue_poll(getValue_state *self) {
    switch (self->_state) {
        case 0: self->_result = 10; self->_done = true; return;
    }
}

typedef struct {
    int32_t _state; int _result; bool _done;
    int32_t x; int32_t y;
    getValue_state _await_0;
} run_state;
static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (getValue_state){0};
            self->_state = 1;
        case 1:
            getValue_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->x = self->_await_0._result;
            self->y = self->x * 2;
            printf("%d\n", self->y);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
