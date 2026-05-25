#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

typedef struct { int32_t _state; int32_t _result; bool _done; } getValue_state;

static void getValue_poll(getValue_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 42;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; bool _done;
    Array_i32 arr;
    getValue_state _await_0;
} foo_state;
static double _arr_data_0[] = {10, 20, 30};

static void foo_poll(foo_state *self) {
    switch (self->_state) {
        case 0:
            self->arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 0};
            self->_await_0 = (getValue_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            getValue_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t x = self->_await_0._result;
            printf("%zu\n", self->arr.length);
            printf("%d\n", x);
            goto _cleanup;
        _cleanup:
            tsc_array_free_i32(&self->arr);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
