#include "runtime.h"

typedef enum { Fields_name, Fields_age } Fields;
static const char *Fields_values[] = { "name", "age" };

int main(void) {
    TSC_INIT();
    return 0;
}
