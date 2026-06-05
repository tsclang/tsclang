#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } nestedContinue_state;

static void nestedContinue_poll(nestedContinue_state *self) {
    switch (self->_state) {
        case 0:
            int32_t count = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < 3)) { goto while_1_end; }
            i = i + 1;
            int32_t j = 0;
            self->_state = 2;
            /* fall through */
case_2:
        case 2:
            if (!(j < 3)) { goto while_2_end; }
            j = j + 1;
            if (j == 2) goto case_2;
            count = count + 1;
            self->_state = 2;
            goto case_2;
while_2_end:
            self->_done = true;
            return;
while_1_end:
            self->_result = count;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
