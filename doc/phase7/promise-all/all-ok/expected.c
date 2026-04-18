#include "runtime.h"

typedef struct {
    int32_t _state;
    int32_t _result;
    bool _done;
} a_state;

static void a_poll(a_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 1;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state;
    int32_t _result;
    bool _done;
} b_state;

static void b_poll(b_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 2;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state;
    int _result;
    bool _done;
    int32_t x;
    int32_t y;
    a_state _await_0;
    b_state _await_1;
} run_state;

static void run_poll(run_state *self) {
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
            self->x = self->_await_0._result;
            self->y = self->_await_1._result;
            printf("%d\n", self->x + self->y);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
