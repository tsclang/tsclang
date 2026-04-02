#include "runtime.h"

typedef struct { String data; } Buffer;

void consume_Buffer(Buffer buf) {
    printf("%s\n", buf.data.data);
}

int main(void) {
    TSC_INIT();
    Buffer b = {0};
    b.data = STR_LIT("hello");
    consume_Buffer(b);
    return 0;
}
