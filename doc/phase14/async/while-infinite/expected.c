#include "runtime.h"

typedef struct { int32_t _state; int _result; bool _done; } delay_state;

static void delay_poll(delay_state *self) {
    switch (self->_state) {
        case 0:
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; } sensor_state;

static void sensor_poll(sensor_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 42;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int _result; bool _done;
    int32_t v;
    sensor_state _await_0;
    delay_state _await_1;
} poll_state;

static void poll_poll(poll_state *self) {
    switch (self->_state) {
        case 0:
            self->_state = 1;
            /* fall through */
        case 1:
            if (!(true)) { self->_done = true; return; }
            self->_await_0 = (sensor_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            sensor_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->v = self->_await_0._result;
            self->_await_1 = (delay_state){0};
            self->_state = 3;
            /* fall through */
        case 3:
            delay_poll(&self->_await_1);
            if (!self->_await_1._done) return;
            self->_state = 1;
            goto case_1;
    }
case_1: ;
}

int main(void) {
    TSC_INIT();
    return 0;
}
