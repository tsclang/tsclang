#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    Array_i32 arr;
    int32_t target;
    size_t _forof_idx_0;
} search_state;

static void search_poll(search_state *self) {
    switch (self->_state) {
        case 0:
            int32_t attempts = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(attempts < 3)) { goto while_1_end; }
            self->_forof_idx_0 = 0;
            self->_state = 2;
            /* fall through */
case_2:
        case 2:
            if (!(self->_forof_idx_0 < self->arr.length)) { goto forof_2_end; }
            const int32_t x = self->arr.data[self->_forof_idx_0];
            if (x == self->target) goto forof_2_end;
forof_2_cont:
            self->_forof_idx_0++;
            if (!(self->_forof_idx_0 < self->arr.length)) { goto forof_2_end; }
            self->_state = 2;
            goto case_2;
forof_2_end:
            attempts = attempts + 1;
            self->_state = 1;
            goto case_1;
while_1_end:
            self->_result = attempts;
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
