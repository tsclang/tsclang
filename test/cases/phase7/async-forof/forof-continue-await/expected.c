#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t x; } filterItem_state;

static void filterItem_poll(filterItem_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = self->x;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    Array_i32 arr;
    int32_t total;
    size_t _forof_idx_0;
    filterItem_state _await_0;
} skipNegative_state;

static void skipNegative_poll(skipNegative_state *self) {
    switch (self->_state) {
        case 0:
            self->total = 0;
            self->_forof_idx_0 = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(self->_forof_idx_0 < self->arr.length)) { goto forof_1_end; }
            const int32_t x = self->arr.data[self->_forof_idx_0];
            self->_await_0 = (filterItem_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            filterItem_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t v = self->_await_0._result;
            if (v < 0) goto forof_1_cont;
            self->total = self->total + v;
forof_1_cont:
            self->_forof_idx_0++;
            if (!(self->_forof_idx_0 < self->arr.length)) { goto forof_1_end; }
            self->_state = 1;
            goto case_1;
forof_1_end:
            self->_result = self->total;
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
